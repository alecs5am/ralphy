"use client";

// ShowcaseResults — the per-format results gallery on a template detail page
// (redesign). One client island owns the shared Lightbox + Remix modal and
// dispatches to the right gallery by the template's `format`:
//
//   sticker-pack → accordion of packs (5-preview header, 8-col grid, lightbox)
//   carousel     → grid of style decks → Instagram-style swipe MODAL
//   fb-creative  → angle filter tabs + grouped square grid → lightbox
//   poster/image → 4-up grid → lightbox
//   video/motion → takes grid (hover-play) → lightbox (video w/ sound)
//
// Every individual output and the template are remixable. ShowcaseOutput is
// imported as a type only (no node:fs pulled into the client bundle).

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShowcaseOutput } from "@/lib/showcase-loader";
import { Lightbox } from "../_shared/Lightbox";
import { RemixModal } from "../_shared/RemixModal";
import type { LightboxItem, LightboxState, RemixPayload } from "../_shared/types";
import { ChevDown, CloseIcon, NextIcon, PrevIcon, RemixIcon } from "../_shared/icons";
import { lockScroll, unlockScroll } from "../_shared/scrollLock";

interface TemplateMeta {
  slug: string;
  name: string;
  tag: string;
  cli: string;
}

const FORMAT_GLYPH: Record<string, string> = {
  video: "▶",
  image: "◐",
  carousel: "❯",
  "fb-creative": "❤",
  "motion-design": "✳",
  poster: "✦",
  "sticker-pack": "✺",
};

const SEC_TITLE: Record<string, string> = {
  "sticker-pack": "The full pack",
  carousel: "The style series",
  "fb-creative": "The creative matrix",
  poster: "Every variant",
  image: "Every variant",
  video: "Every take",
  "motion-design": "Every take",
};
const SEC_BLURB: Record<string, string> = {
  "sticker-pack": "Two finishes, 32 emotions each. Open any sticker — or Remix the whole pack.",
  carousel: "Six art directions. Tap a cover to flip through the deck.",
  "fb-creative": "32 creatives across five angles. Filter, open, Remix.",
  poster: "One composition, multiple punchlines and colorways.",
  image: "Open any variant full-size and Remix with your own brief.",
  video: "Same scene, different edits. Compare the cuts.",
  "motion-design": "Same scene, different edits. Compare the cuts.",
};

function labelOf(o: ShowcaseOutput): string {
  return o.caption || o.groupTitle || o.id;
}

function makeItemRemix(meta: TemplateMeta, o: ShowcaseOutput): RemixPayload {
  return {
    tag: meta.tag,
    cli: meta.cli,
    title: labelOf(o),
    eyebrow: "Remix this output",
    from: `from ${meta.name}`,
    slotCmd: `ralphy generate --template ${meta.slug} --slot ${o.id}`,
    thumb: { kind: o.kind, src: o.src },
    swapHint:
      "e.g. “same output, but with my mascot / product.” Ralphy reproduces it with your brief, keeping everything else.",
  };
}

function toLbItem(meta: TemplateMeta, o: ShowcaseOutput, fmtLabel: string): LightboxItem {
  return { src: o.src, kind: o.kind, label: labelOf(o), fmtLabel, remix: makeItemRemix(meta, o) };
}

interface Group {
  id: string;
  title: string;
  items: ShowcaseOutput[];
}
function groupOutputs(outputs: ShowcaseOutput[], fallbackTitle: string): Group[] {
  const order: string[] = [];
  const byId = new Map<string, Group>();
  for (const o of outputs) {
    const id = o.group ?? "__all";
    if (!byId.has(id)) {
      byId.set(id, { id, title: o.groupTitle ?? o.group ?? fallbackTitle, items: [] });
      order.push(id);
    }
    const g = byId.get(id)!;
    if (o.groupTitle && (!g.title || g.title === g.id)) g.title = o.groupTitle;
    g.items.push(o);
  }
  return order.map((id) => byId.get(id)!);
}

type OpenLb = (items: LightboxItem[], index: number, checker?: boolean) => void;
type OpenRemix = (p: RemixPayload) => void;

export function ShowcaseResults({
  outputs,
  format,
  meta,
}: {
  outputs: ShowcaseOutput[];
  format?: string;
  meta: TemplateMeta;
}) {
  const [lb, setLb] = useState<LightboxState | null>(null);
  const [remix, setRemix] = useState<RemixPayload | null>(null);

  const openLb = useCallback<OpenLb>((items, index, checker) => setLb({ items, index, checker }), []);
  const openRemix = useCallback<OpenRemix>((p) => setRemix(p), []);
  const lbNav = useCallback(
    (dir: number) =>
      setLb((s) => (s ? { ...s, index: (s.index + dir + s.items.length) % s.items.length } : s)),
    [],
  );

  if (outputs.length === 0) return null;

  const count = outputs.length;
  const groupCount = new Set(outputs.map((o) => o.group).filter(Boolean)).size;
  const title = (format && SEC_TITLE[format]) || "Made with this template";
  const isVideoish = format === "video" || format === "motion-design";
  const blurb =
    isVideoish && count <= 1
      ? "The reference render, made with this template."
      : (format && SEC_BLURB[format]) || "Real outputs produced from this recipe. Click any tile to open it full-size.";

  let gallery: React.ReactNode;
  if (format === "sticker-pack") {
    gallery = <StickerGallery outputs={outputs} meta={meta} openLb={openLb} openRemix={openRemix} />;
  } else if (format === "carousel") {
    gallery = <CarouselGallery outputs={outputs} meta={meta} openRemix={openRemix} />;
  } else if (format === "fb-creative" || (groupCount > 1 && format !== "video" && format !== "motion-design")) {
    gallery = <FbGallery outputs={outputs} meta={meta} openLb={openLb} />;
  } else if (format === "video" || format === "motion-design" || outputs.some((o) => o.kind === "video")) {
    gallery = <VideoGallery outputs={outputs} meta={meta} openLb={openLb} openRemix={openRemix} />;
  } else {
    gallery = <PosterGallery outputs={outputs} meta={meta} openLb={openLb} />;
  }

  return (
    <section className="sec sec-results">
      <div className="container container-w-1760">
        <div className="sec-head">
          <h2>{title}</h2>
          <span className="count">
            {count} {count === 1 ? "output" : "outputs"}
            {groupCount > 1 ? ` · ${groupCount} sets` : ""}
          </span>
        </div>
        {blurb && <p className="sec-blurb">{blurb}</p>}
        {gallery}
      </div>

      <Lightbox state={lb} onClose={() => setLb(null)} onNav={lbNav} onRemix={(p) => { setLb(null); setRemix(p); }} />
      <RemixModal payload={remix} onClose={() => setRemix(null)} />
    </section>
  );
}

/* ── Sticker pack ────────────────────────────────────────────────── */
function StickerGallery({
  outputs,
  meta,
  openLb,
  openRemix,
}: {
  outputs: ShowcaseOutput[];
  meta: TemplateMeta;
  openLb: OpenLb;
  openRemix: OpenRemix;
}) {
  const packs = groupOutputs(outputs, "Sticker set");
  const [open, setOpen] = useState<Record<string, boolean>>(() => (packs[0] ? { [packs[0].id]: true } : {}));
  return (
    <div>
      {packs.map((pack) => {
        const isOpen = !!open[pack.id];
        const items = pack.items.map((o) => toLbItem(meta, o, `${pack.title} sticker`));
        return (
          <section className="pack" key={pack.id}>
            <button
              type="button"
              className="pack-head"
              aria-expanded={isOpen}
              onClick={() => setOpen((s) => ({ ...s, [pack.id]: !s[pack.id] }))}
            >
              <span className="pack-strip">
                {pack.items.slice(0, 5).map((o) => (
                  <span key={o.id} className="ps sticker-checker">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.src} alt="" loading="lazy" />
                  </span>
                ))}
              </span>
              <span className="pack-meta">
                <h3>{pack.title}</h3>
                <p>
                  {pack.items.length} stickers · tap to {isOpen ? "collapse" : "expand"}
                </p>
              </span>
              <span className={`pack-chev${isOpen ? " open" : ""}`}>
                <ChevDown />
              </span>
            </button>
            {isOpen && (
              <div className="pack-grid">
                {pack.items.map((o, i) => (
                  <div
                    key={o.id}
                    className="sticker-tile sticker-checker"
                    role="button"
                    tabIndex={0}
                    onClick={() => openLb(items, i, true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openLb(items, i, true);
                    }}
                  >
                    <button
                      type="button"
                      className="mini-remix"
                      aria-label={`Remix ${labelOf(o)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openRemix(makeItemRemix(meta, o));
                      }}
                    >
                      <RemixIcon s={13} />
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.src} alt={labelOf(o)} loading="lazy" />
                    <span className="sl">{labelOf(o)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── Carousel ────────────────────────────────────────────────────── */
function CarouselGallery({
  outputs,
  meta,
  openRemix,
}: {
  outputs: ShowcaseOutput[];
  meta: TemplateMeta;
  openRemix: OpenRemix;
}) {
  const series = groupOutputs(outputs, "Series");
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = series.find((s) => s.id === activeId) ?? null;
  return (
    <div>
      <div className="series-grid">
        {series.map((s) => {
          const cover = s.items[0];
          return (
            <button key={s.id} type="button" className="series-card" onClick={() => setActiveId(s.id)}>
              <div className="sc-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover?.src} alt={s.title} loading="lazy" />
                <span className="badge tl light">{s.items.length} slides</span>
                <span className="badge br dark">Open deck</span>
              </div>
              <div className="sc-body">
                <h3>{s.title}</h3>
                {cover?.caption && <p>{cover.caption}</p>}
              </div>
            </button>
          );
        })}
      </div>
      {active && <CarouselModal series={active} meta={meta} onClose={() => setActiveId(null)} openRemix={openRemix} />}
    </div>
  );
}

function CarouselModal({
  series,
  meta,
  onClose,
  openRemix,
}: {
  series: Group;
  meta: TemplateMeta;
  onClose: () => void;
  openRemix: OpenRemix;
}) {
  const [i, setI] = useState(0);
  const total = series.items.length;
  const go = useCallback((n: number) => setI((c) => Math.min(Math.max(n, 0), total - 1)), [total]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((c) => Math.min(c + 1, total - 1));
      else if (e.key === "ArrowLeft") setI((c) => Math.max(c - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [total, onClose]);
  const slide = series.items[i];
  const touch = useRef<number | null>(null);
  return (
    <div className="cmodal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cmodal-card" onClick={(e) => e.stopPropagation()}>
        <div className="cmodal-head">
          <h3>
            {series.title} <span className="idx">{i + 1} / {total}</span>
          </h3>
          <button type="button" className="m-close" onClick={onClose} aria-label="Close">
            <CloseIcon s={16} />
          </button>
        </div>
        <div
          className="cmodal-stage"
          style={{ aspectRatio: slide?.aspect ?? "4 / 5" }}
          onTouchStart={(e) => {
            touch.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touch.current == null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
            touch.current = null;
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide?.src} alt={`Slide ${i + 1}`} />
          {i > 0 && (
            <button type="button" className="swipe-nav prev" onClick={() => go(i - 1)} aria-label="Previous">
              <PrevIcon />
            </button>
          )}
          {i < total - 1 && (
            <button type="button" className="swipe-nav next" onClick={() => go(i + 1)} aria-label="Next">
              <NextIcon />
            </button>
          )}
        </div>
        <div className="cmodal-foot">
          <div className="swipe-dots">
            {series.items.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                className={idx === i ? "on" : ""}
                onClick={() => go(idx)}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
          <div className="cmodal-cap">
            <div style={{ minWidth: 0 }}>
              <p className="cm-title">{series.title}</p>
              {series.items[0]?.caption && <p className="cm-sub">{series.items[0].caption}</p>}
            </div>
            <button
              type="button"
              className="btn-remix"
              onClick={() =>
                openRemix({
                  tag: meta.tag,
                  cli: meta.cli,
                  title: `${series.title} deck`,
                  eyebrow: "Remix this output",
                  from: `from ${meta.name}`,
                  slotCmd: `ralphy generate --template ${meta.slug} --slot ${series.id}`,
                  thumb: { kind: "image", src: series.items[0]?.src },
                  swapHint: "e.g. “same deck, but with my brand.” Ralphy reproduces it, keeping the layout system.",
                })
              }
            >
              <RemixIcon s={15} /> Remix deck
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── FB creative matrix ──────────────────────────────────────────── */
function FbGallery({ outputs, meta, openLb }: { outputs: ShowcaseOutput[]; meta: TemplateMeta; openLb: OpenLb }) {
  const groups = groupOutputs(outputs, "Creatives");
  const [tab, setTab] = useState("all");
  const shown = tab === "all" ? groups : groups.filter((g) => g.id === tab);
  return (
    <div>
      <div className="fb-tabs">
        <button type="button" className={`fchip${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>
          All angles<span className="cnt">{outputs.length}</span>
        </button>
        {groups.map((g) => (
          <button key={g.id} type="button" className={`fchip${tab === g.id ? " active" : ""}`} onClick={() => setTab(g.id)}>
            {g.title}
            <span className="cnt">{g.items.length}</span>
          </button>
        ))}
      </div>
      {shown.map((g) => {
        const items = g.items.map((o) => toLbItem(meta, o, `${g.title} creative`));
        return (
          <section className="fb-group" key={g.id}>
            <div className="fb-group-head">
              <h3>{g.title}</h3>
              <span className="gc">
                Set {g.id.toUpperCase()} · {g.items.length}
              </span>
            </div>
            <div className="fb-grid">
              {g.items.map((o, i) => (
                <button key={o.id} type="button" className="fb-tile" onClick={() => openLb(items, i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.src} alt={labelOf(o)} loading="lazy" />
                  <span className="cap">{labelOf(o)}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ── Poster / image grid ─────────────────────────────────────────── */
function PosterGallery({ outputs, meta, openLb }: { outputs: ShowcaseOutput[]; meta: TemplateMeta; openLb: OpenLb }) {
  const items = outputs.map((o) => toLbItem(meta, o, "Poster variant"));
  return (
    <div className="poster-grid">
      {outputs.map((o, i) => (
        <button key={o.id} type="button" className="poster-tile" onClick={() => openLb(items, i)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={o.src} alt={labelOf(o)} loading="lazy" />
          <span className="cap">{labelOf(o)}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Video / takes — always-looping muted preview ─────────────────── */
function LoopVideo({ src }: { src: string }) {
  return (
    <video src={`${src}#t=0.1`} muted loop autoPlay playsInline preload="metadata" disablePictureInPicture />
  );
}

function VideoGallery({
  outputs,
  meta,
  openLb,
  openRemix,
}: {
  outputs: ShowcaseOutput[];
  meta: TemplateMeta;
  openLb: OpenLb;
  openRemix: OpenRemix;
}) {
  const items = outputs.map((o) => toLbItem(meta, o, "Video take"));
  return (
    <div className={`takes-grid${outputs.length === 1 ? " single" : ""}`}>
      {outputs.map((o, i) => (
        <article className="take" key={o.id}>
          <div className="tk-media" style={{ aspectRatio: o.aspect }} onClick={() => openLb(items, i)}>
            {o.kind === "video" ? (
              <LoopVideo src={o.src} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.src} alt={labelOf(o)} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </div>
          <div className="tk-body">
            <div style={{ minWidth: 0 }}>
              <h4>{labelOf(o)}</h4>
              {o.caption && o.caption !== labelOf(o) && <p>{o.caption}</p>}
            </div>
            <button type="button" className="remix-pill" onClick={() => openRemix(makeItemRemix(meta, o))}>
              <RemixIcon /> Remix
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
