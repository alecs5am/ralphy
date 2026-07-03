"use client";

import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { site } from "@/lib/data";
import { I } from "../Icons";
import { MascotSVG } from "../MascotSVG";

/* Kiro.dev-style scroll-driven width expansion. The CTA block starts
 * at 1320px and grows to 1480px as the section enters the viewport.
 * The content inside stays centered, only the bg-bar grows sideways.
 * Progress is mapped 0..1 across "section just entered" → "section
 * well in view" so the animation completes early and then sits at
 * max width while the user reads. */
export function StarCta({ stars }: { stars: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 95%", "start 35%"],
  });
  const maxWidth = useTransform(scrollYProgress, [0, 1], [1320, 1480]);

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(site.install);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <section className="pt-14" ref={ref}>
      <div className="px-4">
        <motion.div
          className="relative mx-auto bg-vio rounded-[32px] pt-24 px-8 pb-0 max-[640px]:pt-16 max-[640px]:px-6 text-center overflow-hidden isolate w-full"
          style={{ maxWidth, willChange: "max-width" }}
        >
          <h2 className="font-display font-bold text-[clamp(40px,6vw,76px)] leading-[1.05] tracking-[-0.02em] uppercase text-ink m-0 text-balance">
            Ship something real
            <br />
            in minutes
          </h2>
          <p className="mt-[18px] mb-7 mx-auto text-[rgb(10_10_11/0.7)] text-[15.5px] leading-[1.5]">Get started for free</p>

          <div className="flex flex-wrap gap-3 justify-center items-center mb-16 relative z-[3]">
            <a
              className="group inline-flex items-center gap-2 px-[22px] py-3 bg-white text-[#0A0A0B] rounded-full font-semibold text-[14px] tracking-[-0.005em] transition-[background,transform] duration-[180ms] hover:bg-[#F1EEEA] hover:-translate-y-px [&_svg]:text-[#0A0A0B]"
              href={site.repo}
              target="_blank"
              rel="noopener"
            >
              <I.star /> Star on GitHub
              <span className="font-mono bg-[rgb(0_0_0/0.08)] px-[7px] py-px rounded-full text-[11.5px] text-[#0A0A0B]">
                {stars}
              </span>
            </a>

            <button
              className="group inline-flex items-stretch bg-[#0E0E10] text-ink rounded-full p-0 font-mono text-[13px] overflow-hidden cursor-pointer transition-[box-shadow] duration-[180ms] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.24)]"
              onClick={copy}
              aria-label="Copy install command"
            >
              <span className="inline-flex items-center px-4 py-3 text-[#F5F5F4] font-sans font-semibold text-[14px] tracking-[-0.005em]">Install CLI</span>
              <span className="inline-flex items-center px-[14px] py-3 bg-[#050506] text-[#F5F5F4] whitespace-nowrap shadow-[inset_1px_0_0_rgb(255_255_255/0.08)] max-[640px]:hidden">
                <span className="text-vio mr-1">curl</span>
                <span className="text-[rgb(245_245_244/0.55)]"> -fsSL </span>
                <span>raw.githubusercontent.com/alecs5am/ralphy/…</span>
              </span>
              <span
                className={`inline-flex items-center justify-center px-[14px] py-3 bg-[#050506] shadow-[inset_1px_0_0_rgb(255_255_255/0.08)] transition-colors duration-[180ms] ${
                  copied ? "text-[#B0E3B5]" : "text-[rgb(245_245_244/0.6)] group-hover:text-vio"
                }`}
              >
                {copied ? <I.check /> : <I.copy />}
              </span>
            </button>
          </div>

          <MascotSVG className="block w-[clamp(220px,32vw,360px)] h-auto mx-auto -mb-[6%] relative z-[2]" ariaLabel="Ralphy" />
        </motion.div>
      </div>
    </section>
  );
}
