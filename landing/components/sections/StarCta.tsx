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
    <section className="cta-section" ref={ref}>
      <div className="cta-section-inner">
        <motion.div
          className="cta-block"
          style={{ maxWidth, willChange: "max-width" }}
        >
          <h2 className="cta-headline">
            Ship something real
            <br />
            in minutes
          </h2>
          <p className="cta-sub">Get started for free</p>

          <div className="cta-buttons">
            <a
              className="cta-btn-light"
              href={site.repo}
              target="_blank"
              rel="noopener"
            >
              <I.star /> Star on GitHub
              <span className="star-count">{stars}</span>
            </a>

            <button
              className={`cta-btn-cli ${copied ? "copied" : ""}`}
              onClick={copy}
              aria-label="Copy install command"
            >
              <span className="cta-cli-label">Install CLI</span>
              <span className="cta-cli-cmd">
                <span className="prm">curl</span>
                <span className="dim"> -fsSL </span>
                <span>raw.githubusercontent.com/alecs5am/ralphy/…</span>
              </span>
              <span className="cta-cli-copy">
                {copied ? <I.check /> : <I.copy />}
              </span>
            </button>
          </div>

          <MascotSVG className="cta-mascot" ariaLabel="Ralphy" />
        </motion.div>
      </div>
    </section>
  );
}
