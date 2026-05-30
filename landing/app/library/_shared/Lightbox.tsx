"use client";

// Shared fullscreen lightbox (ported from the prototype's overlays.jsx).
// Keyboard Esc / ← / →, body scroll-lock, optional checkerboard backing for
// transparent stickers, and a bottom bar with a Remix-this action.

import { useEffect } from "react";
import { CloseIcon, NextIcon, PrevIcon, RemixIcon } from "./icons";
import type { LightboxState } from "./types";
import type { RemixPayload } from "./types";
import { lockScroll, unlockScroll } from "./scrollLock";

export function Lightbox({
  state,
  onClose,
  onNav,
  onRemix,
}: {
  state: LightboxState | null;
  onClose: () => void;
  onNav: (dir: number) => void;
  onRemix: (payload: RemixPayload) => void;
}) {
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNav(1);
      else if (e.key === "ArrowLeft") onNav(-1);
    };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [state, onClose, onNav]);

  if (!state) return null;
  const { items, index, checker } = state;
  const it = items[index];
  if (!it) return null;
  const hasNav = items.length > 1;

  return (
    <div className="lb" onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" className="lb-close" onClick={onClose} aria-label="Close">
        <CloseIcon />
      </button>
      {hasNav && (
        <button
          type="button"
          className="lb-nav prev"
          onClick={(e) => {
            e.stopPropagation();
            onNav(-1);
          }}
          aria-label="Previous"
        >
          <PrevIcon />
        </button>
      )}
      {hasNav && (
        <button
          type="button"
          className="lb-nav next"
          onClick={(e) => {
            e.stopPropagation();
            onNav(1);
          }}
          aria-label="Next"
        >
          <NextIcon />
        </button>
      )}
      <div className={`lb-stage${checker ? " checker sticker-checker" : ""}`} onClick={(e) => e.stopPropagation()}>
        {it.kind === "video" ? (
          // key forces a remount per item so the ref runs on prev/next nav.
          // The lightbox opens from a user click, so unmuted autoplay is allowed —
          // explicitly unmute + play so the take is heard, not silent.
          <video
            key={it.src}
            ref={(el) => {
              if (el) {
                el.muted = false;
                el.volume = 1;
                el.play().catch(() => {});
              }
            }}
            src={it.src}
            controls
            autoPlay
            loop
            playsInline
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.src} alt={it.label ?? ""} />
        )}
      </div>
      <div className="lb-bar">
        <div>
          {it.fmtLabel && (
            <div className="lbl">
              {it.fmtLabel}
              {hasNav ? ` · ${index + 1} / ${items.length}` : ""}
            </div>
          )}
          <div className="ttl">{it.label ?? ""}</div>
        </div>
        {it.remix && (
          <div className="lb-actions">
            <button
              type="button"
              className="btn-remix"
              onClick={(e) => {
                e.stopPropagation();
                onRemix(it.remix!);
              }}
            >
              <RemixIcon s={15} /> Remix this
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
