"use client";

import { useEffect, useState } from "react";
import { site } from "@/lib/data";
import { I } from "./Icons";

export function StickyBar({ stars }: { stars: string }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      const distBottom = docH - (y + winH);
      setVisible(y > winH * 0.55 && distBottom > 200);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(site.install);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className={`sticky-bar ${visible ? "" : "hidden"}`}>
      <div className="inner">
        <button className={`cmd ${copied ? "copied" : ""}`} onClick={copy} aria-label="Copy install command">
          <span className="ico">
            <I.term />
          </span>
          <span className="dollar">$ </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{site.install}</span>
          <span className="copy">{copied ? "copied ✓" : "copy"}</span>
        </button>
        <a className="btn btn-vio" href={site.repo} target="_blank" rel="noopener">
          <I.star /> Star <span className="star-count">{stars}</span>
        </a>
      </div>
    </div>
  );
}
