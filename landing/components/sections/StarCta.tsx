"use client";

import { useState } from "react";
import { site } from "@/lib/data";
import { I } from "../Icons";
import { MascotSVG } from "../MascotSVG";

export function StarCta({ stars }: { stars: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(site.install);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <section className="cta-section">
      <div className="container">
        <div className="cta-block">
          <h2 className="cta-headline">
            Ship something real
            <br />
            in minutes
          </h2>
          <p className="cta-sub">Get started for free</p>

          <div className="cta-buttons">
            <a className="cta-btn-light" href={site.repo} target="_blank" rel="noopener">
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
              <span className="cta-cli-copy">{copied ? <I.check /> : <I.copy />}</span>
            </button>
          </div>

          <MascotSVG className="cta-mascot" ariaLabel="Ralphy" />
        </div>
      </div>
    </section>
  );
}
