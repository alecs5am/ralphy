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
      className={`lib-cta ${copied ? "is-copied" : ""}`}
      aria-label={`Copy ${tag} to clipboard`}
    >
      <span className="lib-cta-eyebrow">{label}</span>
      <span className="lib-cta-row">
        <code className="lib-cta-tag">{tag}</code>
        <span className="lib-cta-action">
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
