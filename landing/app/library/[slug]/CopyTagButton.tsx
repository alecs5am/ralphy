"use client";

import { useState } from "react";

// CTA pattern matches the landing's install-cmd block:
// a dark code-style line you click to copy. No candy-button pill. The
// "Try in Ralphy" affordance is set above as an eyebrow so the visual hierarchy
// reads as "label → code line → hint" not "loud orange button → mystery code".
export function CopyTagButton({ tag, label = "Try in Ralphy" }: { tag: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(tag);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = tag;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* swallow */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-2 pl-[18px] pr-4 py-3.5 bg-bg-1 border-0 rounded-[14px] cursor-pointer font-sans text-left w-full max-w-full text-ink transition-[background] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-bg-2"
      aria-label={`Copy ${tag} to clipboard`}
    >
      <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-vio">{label}</span>
      <span className="flex items-center justify-between gap-4 min-w-0">
        <code className="font-mono text-[14.5px] text-ink min-w-0 [overflow-wrap:anywhere] break-words">{tag}</code>
        <span
          className={`inline-flex items-center gap-1.5 font-mono text-[11.5px] tracking-[0.08em] uppercase pl-[9px] pr-2.5 py-1.5 rounded-full shrink-0 transition-[color,background] duration-[180ms] [&_svg]:block ${
            copied
              ? "text-vio bg-[color-mix(in_srgb,var(--color-vio)_18%,transparent)]"
              : "text-ink-3 bg-bg-2 group-hover:text-vio group-hover:bg-bg-3"
          }`}
        >
          {copied ? (
            <>
              <CheckIcon />
              Copied
            </>
          ) : (
            <>
              <CopyIcon />
              Copy
            </>
          )}
        </span>
      </span>
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="3.5" y="1.5" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 4v7.5A1.5 1.5 0 0 0 3.5 13H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
