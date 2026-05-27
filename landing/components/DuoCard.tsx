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
    <article
      ref={ref}
      className={`flex flex-col gap-6 ${
        reverse ? "[&_.chapter-head]:min-[960px]:flex-row-reverse" : ""
      }`}
    >
      <motion.header className="chapter-head flex items-center gap-5 min-w-0" {...reveal(0)}>
        <span
          className="font-display font-bold text-[clamp(56px,9.5vw,140px)] tracking-[-0.04em] leading-[0.85] text-vio shrink-0 inline-block"
          aria-hidden
        >
          {n}
        </span>
        <span className="block flex-1 h-0.5 bg-bg-3 min-w-[32px]" aria-hidden />
        {kicker && (
          <span className="font-mono text-[13px] tracking-[0.18em] uppercase text-mute shrink-0 whitespace-nowrap">
            {kicker}
          </span>
        )}
      </motion.header>

      <div
        className={`grid grid-cols-1 gap-7 items-start min-[960px]:gap-14 ${
          reverse
            ? "min-[960px]:grid-cols-[1.6fr_1fr] [&>.chapter-text]:min-[960px]:order-2 [&>.chapter-term]:min-[960px]:order-1"
            : "min-[960px]:grid-cols-[1fr_1.6fr]"
        }`}
      >
        <div
          className={`chapter-text flex flex-col gap-[18px] min-w-0 ${
            reverse ? "min-[960px]:[&>.chapter-title]:ml-auto min-[960px]:[&>.chapter-title]:text-right min-[960px]:[&>.chapter-copy]:ml-auto min-[960px]:[&>.chapter-copy]:text-right" : ""
          }`}
        >
          <motion.h3
            className="chapter-title font-display font-bold text-[clamp(28px,3.6vw,48px)] tracking-[-0.02em] leading-[1.04] uppercase text-ink m-0 text-balance max-w-[22ch] [&_.acc]:text-vio"
            {...reveal(0.08)}
          >
            {title}
          </motion.h3>
          <motion.p
            className="chapter-copy text-[17px] text-ink-3 leading-[1.65] m-0 max-w-[56ch] [&_.acc]:text-vio [&_.inl]:font-mono [&_.inl]:text-[0.88em] [&_.inl]:text-vio-2 [&_.inl]:bg-[color-mix(in_srgb,var(--color-vio)_12%,transparent)] [&_.inl]:px-1.5 [&_.inl]:py-px [&_.inl]:rounded-[4px]"
            {...reveal(0.16)}
          >
            {copy}
          </motion.p>
        </div>
        <motion.div className="chapter-term w-full min-w-0" {...reveal(0.24)}>
          {terminal}
        </motion.div>
      </div>
    </article>
  );
}
