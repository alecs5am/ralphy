"use client";

import { type ReactNode, useRef } from "react";
import { motion, useInView } from "framer-motion";

/* Editorial "chapter" layout for HowItWorks.
 *
 * Structure:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ 01 ──────────────────────────────────── trend-watch  │  ← head row, full width
 *   ├──────────────────────────────────────────────────────┤
 *   │ TITLE                          │ ┌────────────────┐  │
 *   │                                │ │ terminal       │  │  ← body, 2-col
 *   │ description copy here...       │ │ content        │  │
 *   │                                │ └────────────────┘  │
 *   └──────────────────────────────────────────────────────┘
 *
 * On `.reverse`, the body columns flip — terminal goes left, text
 * goes right — and the head row mirrors so the giant number lands
 * on the same side as the terminal's opposite column.
 *
 * Entrance: staggered fade + slide on the head / title / copy /
 * terminal so each part reveals as it scrolls into view, once. */
export function DuoCard({
  n,
  kicker,
  title,
  copy,
  terminal,
  reverse,
}: {
  n: string;
  kicker?: ReactNode;
  title: ReactNode;
  copy: ReactNode;
  terminal: ReactNode;
  reverse?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.18 });

  const reveal = (delay: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: inView ? { opacity: 1, y: 0 } : undefined,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const, delay },
  });

  return (
    <article ref={ref} className={`chapter ${reverse ? "reverse" : ""}`}>
      <motion.header className="chapter-head" {...reveal(0)}>
        <span className="chapter-n" aria-hidden>
          {n}
        </span>
        <span className="chapter-rule" aria-hidden />
        {kicker && <span className="chapter-kicker">{kicker}</span>}
      </motion.header>

      <div className="chapter-body">
        <div className="chapter-text">
          <motion.h3 className="chapter-title" {...reveal(0.08)}>
            {title}
          </motion.h3>
          <motion.p className="chapter-copy" {...reveal(0.16)}>
            {copy}
          </motion.p>
        </div>
        <motion.div className="chapter-term" {...reveal(0.24)}>
          {terminal}
        </motion.div>
      </div>
    </article>
  );
}
