"use client";

// StickerPackGallery — Telegram-style pack browser (issue 060). Outputs are
// grouped into packs (by `group`, e.g. "outline" vs "clean-silhouette"). Each
// pack is a tile showing a few preview stickers; clicking a pack EXPANDS it in
// place to reveal every sticker in detail — no navigation, same page.
//
// Stickers are transparent PNGs, so every tile sits on a subtle checkerboard
// backing (the `sticker-checker` class) to read the die-cut alpha. No visible
// borders: tiles separate via the checker tint + rounding + spacing.

import { useState } from "react";
import type { ShowcaseOutput } from "@/lib/showcase-loader";
import { MediaPlayer } from "@/components/MediaPlayer";

interface Pack {
  id: string;
  title: string;
  stickers: ShowcaseOutput[];
}

function toPacks(outputs: ShowcaseOutput[]): Pack[] {
  const order: string[] = [];
  const byId = new Map<string, Pack>();
  for (const o of outputs) {
    const id = o.group ?? "pack";
    if (!byId.has(id)) {
      byId.set(id, { id, title: o.groupTitle ?? "Sticker set", stickers: [] });
      order.push(id);
    }
    byId.get(id)!.stickers.push(o);
  }
  return order.map((id) => byId.get(id)!);
}

function StickerTile({ o }: { o: ShowcaseOutput }) {
  return (
    <figure className="sticker-checker m-0 rounded-[16px] p-2.5">
      <MediaPlayer kind="image" src={o.src} alt={o.caption ?? o.id} aspect={o.aspect} />
    </figure>
  );
}

export function StickerPackGallery({ outputs }: { outputs: ShowcaseOutput[] }) {
  const packs = toPacks(outputs);
  // First pack expanded by default so the page reads full immediately.
  const [open, setOpen] = useState<Record<string, boolean>>(
    () => (packs[0] ? { [packs[0].id]: true } : {}),
  );

  return (
    <div className="flex flex-col gap-8">
      {packs.map((pack) => {
        const isOpen = !!open[pack.id];
        return (
          <section key={pack.id}>
            <button
              type="button"
              onClick={() => setOpen((s) => ({ ...s, [pack.id]: !s[pack.id] }))}
              className="group/pack w-full flex items-center gap-4 bg-bg-1 hover:bg-bg-2 rounded-[18px] p-3.5 border-0 cursor-pointer text-left transition-colors duration-[160ms]"
              aria-expanded={isOpen}
            >
              {/* Mini preview strip — first 5 stickers on a checker chip. */}
              <div className="flex gap-1.5 shrink-0">
                {pack.stickers.slice(0, 5).map((o) => (
                  <span
                    key={o.id}
                    className="sticker-checker w-12 h-12 rounded-[10px] grid place-items-center overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.src} alt="" className="w-full h-full object-contain" />
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-[18px] leading-[1.15] m-0 font-semibold text-ink tracking-[-0.01em]">
                  {pack.title}
                </h3>
                <p className="font-mono text-[11.5px] tracking-[0.08em] uppercase text-mute m-0 mt-1">
                  {pack.stickers.length} stickers · tap to {isOpen ? "collapse" : "expand"}
                </p>
              </div>
              <span
                className={`shrink-0 text-mute group-hover/pack:text-ink transition-transform duration-[220ms] ${isOpen ? "rotate-180" : ""}`}
                aria-hidden
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4.5 6.5L9 11l4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>

            {isOpen && (
              <div className="grid grid-cols-6 gap-3 mt-4 max-[1100px]:grid-cols-5 max-[820px]:grid-cols-4 max-[560px]:grid-cols-3">
                {pack.stickers.map((o) => (
                  <StickerTile key={o.id} o={o} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
