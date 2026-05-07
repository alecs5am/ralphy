"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type Delay = 0 | 1 | 2 | 3 | 4;

export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: Delay;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const delayClass = delay === 0 ? "" : ` d${delay}`;
  const Component = Tag as React.ElementType;
  return (
    <Component ref={ref as never} className={`reveal${delayClass} ${className}`.trim()}>
      {children}
    </Component>
  );
}
