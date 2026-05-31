"use client";

// SlotPicker — the swap menu opened from a "change" / "add" control on an
// ingredient row (ported from the prototype's overlays.jsx SlotPicker). Shows
// the fitting blocks (the `applicable` list, with the current one marked),
// a "Describe a new one" text input, and an "Upload a reference" button.
// Returns a staged-swap choice to the caller via onPick. Esc / backdrop closes;
// body scroll-locked while open.

import { useEffect, useState } from "react";
import type { Block } from "@/lib/library-v2/types";
import { CloseIcon, UploadIcon } from "./icons";
import { lockScroll, unlockScroll } from "./scrollLock";

/** A staged-swap choice the picker returns. */
export type SlotChoice =
  | { type: "block"; block: Block }
  | { type: "describe"; text: string }
  | { type: "upload" };

export interface SlotPickerState {
  axisLabel: string;
  kindLabel: string;
  glyph: string;
  /** The block currently in this slot (shown as "current"), if any. */
  current?: Block;
  /** The applicable / fitting blocks for this slot. */
  options: Block[];
}

function GlyphThumb({ glyph }: { glyph: string }) {
  return <span className="pk-thumb glyphy">{glyph}</span>;
}

function blockGlyphOf(b: Block, kindGlyph: string): string {
  // Use the picker's kind glyph as a stable fallback for every option (they all
  // share the slot's kind / asset-sub), so the picker reads consistently.
  return kindGlyph || (b.kind === "asset" ? "◆" : "▦");
}

export function SlotPicker({
  state,
  onClose,
  onPick,
}: {
  state: SlotPickerState | null;
  onClose: () => void;
  onPick: (choice: SlotChoice) => void;
}) {
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!state) return;
    setDesc("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [state, onClose]);

  if (!state) return null;
  const { axisLabel, kindLabel, glyph, current, options } = state;
  const kindLower = kindLabel.toLowerCase();

  return (
    <div className="picker" onClick={onClose} role="dialog" aria-modal="true">
      <div className="picker-card" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head" style={{ position: "relative" }}>
          <p className="pk-eye">
            <span style={{ fontFamily: "var(--font-display)" }}>{glyph}</span> Change the {axisLabel}
          </p>
          <h3>{axisLabel}</h3>
          <p>
            Swap in another {kindLower} that fits this slot, describe a fresh one, or drop your own
            reference. Everything else stays pinned.
          </p>
          <button type="button" className="pk-close" onClick={onClose} aria-label="Close">
            <CloseIcon s={16} />
          </button>
        </div>
        <div className="picker-body">
          <p className="pk-label">
            Fitting {kindLower}s · {options.length}
          </p>
          <div className="pk-grid">
            {current && (
              <button type="button" className="pk-opt current" onClick={onClose}>
                <GlyphThumb glyph={blockGlyphOf(current, glyph)} />
                <span className="pk-meta">
                  <span className="pn">{current.name}</span>
                  <span className="pm">{current.blurb}</span>
                </span>
                <span className="pk-cur">current</span>
              </button>
            )}
            {options.map((b) => (
              <button
                type="button"
                key={b.id}
                className="pk-opt"
                onClick={() => onPick({ type: "block", block: b })}
              >
                <GlyphThumb glyph={blockGlyphOf(b, glyph)} />
                <span className="pk-meta">
                  <span className="pn">{b.name}</span>
                  <span className="pm">{b.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          <p className="pk-label">Describe a new one</p>
          <div className="pk-new">
            <input
              type="text"
              value={desc}
              placeholder={`e.g. "a ${kindLower} like…"`}
              onChange={(e) => setDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && desc.trim()) onPick({ type: "describe", text: desc.trim() });
              }}
            />
            <button
              type="button"
              className="pk-go"
              disabled={!desc.trim()}
              onClick={() => desc.trim() && onPick({ type: "describe", text: desc.trim() })}
            >
              Generate
            </button>
          </div>

          <p className="pk-label">Or bring your own</p>
          <button type="button" className="pk-upload" onClick={() => onPick({ type: "upload" })}>
            <span className="pu-ic">
              <UploadIcon />
            </span>
            <span>Upload a reference — Ralphy matches the slot to your image or clip.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
