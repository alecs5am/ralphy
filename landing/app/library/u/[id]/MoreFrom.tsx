"use client";

// MoreFrom — the below-the-fold horizontal recommendation rails on the
// unit-detail page (#094). One rail PER dimension the unit has, in
// most-relevant-first order:
//   More from {Template} — other units built on the same skeleton
//   More with {Tag}      — other units sharing one of the unit's tags (a tag is
//                          a feed filter, so its head links to ?tag=, not a block)
//   Uses {Recipe}        — other units that apply the same recipe
//   Uses {Asset}         — other units that reuse the same character/location/prop/music
//   More in {Format}     — other units of the same format/type (broadest match)
//
// The page (a Server Component) prepares the rails server-side: each `Rail`
// already arrives self-excluded, deduped ACROSS rails (a unit appears in at most
// one), capped, and non-empty. This client island only maps each rail to a head
// + a <UnitRail> (compact <UnitCard>s in a <Carousel> scroll-snap strip).
//
// No visible borders: separation via bg-tint + shadow + spacing only.

import Link from "next/link";
import type { Block, Format, Unit } from "@/lib/library-v2/types";
import { UnitRail } from "../../_shared/UnitRail";

/** One prepared recommendation rail. The page builds these in priority order
 *  (template → each tag → each recipe → each asset → format); `units` is already
 *  self-excluded, deduped across rails, and capped. */
export interface Rail {
  /** Stable React key + dedup id (e.g. "template:showcase-wall", "tag:bloom"). */
  key: string;
  /** Head verb: "More from" / "More with" / "Uses" / "More in". */
  lead: string;
  /** Dimension label: "Template" / "Tag" / "Recipe" / "Character" / "Format" … */
  kindLabel: string;
  /** Head glyph for the dimension chip. */
  glyph: string;
  /** The block / tag / format name shown after the dimension. */
  name: string;
  /** One-line rail blurb. */
  sub: string;
  /** Where the head links — a block page, the tag feed, or the format feed. */
  href: string;
  units: Unit[];
}

export interface MoreFromProps {
  formats: Format[];
  blocks: Block[];
  rails: Rail[];
}

export function MoreFrom({ formats, blocks, rails }: MoreFromProps) {
  if (rails.length === 0) return null;

  return (
    <>
      {rails.map((r) => (
        <section key={r.key} className="sec morefrom">
          <div className="container container-w-1760">
            <div className="sec-head" style={{ marginBottom: 8 }}>
              <h2 className="mf-title" style={{ fontSize: "clamp(20px,2.4vw,28px)" }}>
                {r.lead}{" "}
                <span className="mf-kind">
                  <span className="mf-glyph">{r.glyph}</span>
                  {r.kindLabel}
                </span>{" "}
                <span className="mf-sep">·</span> {r.name}
              </h2>
              <Link
                href={r.href}
                className="seeall"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--vio)",
                }}
              >
                {r.kindLabel === "Tag" || r.kindLabel === "Format" ? "see all →" : "open block →"}
              </Link>
            </div>
            <p className="sec-blurb" style={{ marginTop: 0 }}>
              {r.sub}
            </p>
            <UnitRail units={r.units} formats={formats} blocks={blocks} />
          </div>
        </section>
      ))}
    </>
  );
}
