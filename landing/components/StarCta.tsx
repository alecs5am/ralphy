"use client";

import { useState } from "react";
import { Block, Inline } from "./Block";
import { StarIcon } from "./icons";
import { site } from "@/lib/site";

export function StarCta() {
  const [copied, setCopied] = useState<"idle" | "copied" | "error">("idle");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(site.install);
      setCopied("copied");
      setTimeout(() => setCopied("idle"), 1600);
    } catch {
      setCopied("error");
      setTimeout(() => setCopied("idle"), 1600);
    }
  };

  return (
    <section id="cta" className="relative">
      <div className="mx-auto max-w-[1180px] px-7">
        <Block
          n="09"
          title={<>Free, open, MIT. Star it if you ship with it.</>}
          lede={
            <>
              Stars are how operators find Ralphy, how templates get adopted,
              how your weird beautiful style family ends up landing customers
              for someone else. <Inline>No paywall.</Inline>{" "}
              <Inline>No upsell.</Inline>{" "}
              <Inline cyan>Just one click.</Inline>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <a
              className="btn btn-primary"
              href={site.repo}
              target="_blank"
              rel="noopener"
            >
              <StarIcon />
              Star alecs5am/ralphy
              <span className="star-count">+1</span>
            </a>
            <button
              onClick={onCopy}
              className="btn btn-ghost"
              aria-label="Copy install command"
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>
                $ curl -fsSL …/install.sh | sh
              </span>
              <span
                className={
                  "transition-colors " +
                  (copied === "copied"
                    ? "text-[var(--color-cyan-2)]"
                    : "text-[var(--color-cyan)]")
                }
                style={{ fontFamily: "var(--font-pixel)", fontSize: "12px" }}
              >
                {copied === "copied" ? "copied ✓" : copied === "error" ? "press ⌘C" : "copy"}
              </span>
            </button>
          </div>
        </Block>
      </div>
    </section>
  );
}
