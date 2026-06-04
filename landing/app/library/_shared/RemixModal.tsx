"use client";

// Shared Remix modal (ported from the prototype's overlays.jsx RemixModal +
// CopyRow). Presentation-only: the caller hands it a fully-resolved
// `RemixPayload`. Esc / backdrop closes; body scroll-locked while open.

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, CloseIcon, CopyIcon, SwapIcon } from "./icons";
import type { RemixPayload } from "./types";
import { lockScroll, unlockScroll } from "./scrollLock";
import { Media } from "./Media";

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* swallow */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [value]);
  return (
    <div className="m-copyrow">
      <code>{value}</code>
      <button type="button" className={`copy${copied ? " copied" : ""}`} onClick={copy}>
        {copied ? (
          <>
            <CheckIcon /> Copied
          </>
        ) : (
          <>
            <CopyIcon /> Copy
          </>
        )}
      </button>
    </div>
  );
}

export function RemixModal({ payload, onClose }: { payload: RemixPayload | null; onClose: () => void }) {
  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [payload, onClose]);

  if (!payload) return null;

  const { tag, cli, title, eyebrow, from, slotCmd, thumb, swapHint, swaps } = payload;

  let thumbNode: React.ReactNode = null;
  if (thumb && "src" in thumb) {
    // Route the thumbnail through the shared <Media> (#086/#088) — fill the
    // fixed .m-thumb box (cover), no lightbox (it's a chrome thumb, not content).
    thumbNode = (
      <Media
        src={thumb.src}
        kind={thumb.kind}
        fit="cover"
        lightbox={false}
        muted
        loop
        autoPlay
        className="media-cell"
        alt=""
      />
    );
  } else if (thumb && "glyph" in thumb) {
    thumbNode = (
      <span style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--vio)" }}>{thumb.glyph}</span>
    );
  }

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          {thumbNode && <div className="m-thumb">{thumbNode}</div>}
          <div style={{ minWidth: 0 }}>
            <p className="m-eyebrow">{eyebrow}</p>
            <h3>{title}</h3>
            {from && <p className="m-from">{from}</p>}
          </div>
          <button type="button" className="m-close" onClick={onClose} aria-label="Close">
            <CloseIcon s={16} />
          </button>
        </div>

        {swaps && swaps.length > 0 && (
          <>
            <p className="m-label">Your swaps</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {swaps.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--ink-3)",
                    background: "#050506",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <span style={{ color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".08em", fontSize: 10, minWidth: 70 }}>
                    {s.axis}
                  </span>
                  <span style={{ textDecoration: "line-through", color: "var(--mute-2)" }}>{s.fromName}</span>
                  <SwapIcon s={13} />
                  <span style={{ color: "var(--vio-2)" }}>{s.toLabel}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="m-label">1 · Copy the tag</p>
        <CopyRow value={tag} />
        <p className="m-label">2 · Or run the CLI</p>
        <CopyRow value={cli} />
        {slotCmd && (
          <>
            <p className="m-label">Regenerate just this slot</p>
            <CopyRow value={slotCmd} />
          </>
        )}

        <p className="m-hint">
          Paste the tag into <strong>Claude Code / Cursor / Codex</strong> and say what to swap
          {swapHint ? ` — ${swapHint}` : ". Ralphy rebuilds it from your refs, re-running only what the swap touches."}
        </p>
      </div>
    </div>
  );
}
