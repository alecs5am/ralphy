"use client";

// MoreFrom — the below-the-fold horizontal rails on the unit-detail page:
//   More from {Template} — other units built on the same skeleton
//   More with {tag}      — other units sharing this unit's look / tag (a tag is
//                          a feed filter, so its rail head links to ?tag=, not a
//                          block page).
// Compact UnitTiles in a scroll-snap rail.

import Link from "next/link";
import type { Block, BlockKind, Format, Unit } from "@/lib/library-v2/types";
import { UnitTile } from "../../_shared/UnitTile";
import { KIND_META } from "../../_shared/blockMeta";

export interface MoreFromProps {
  formats: Format[];
  blocks: Block[];
  template?: Block;
  /** The unit's lead look tag (was the Style block) — drives the "More with" rail. */
  lookTag?: string;
  fromTemplate: Unit[];
  withLook: Unit[];
}

export function MoreFrom({ formats, blocks, template, lookTag, fromTemplate, withLook }: MoreFromProps) {
  const fmtById = new Map(formats.map((f) => [f.id, f]));
  const blockBy = (kind: BlockKind, id: string): Block | undefined =>
    blocks.find((b) => b.kind === kind && b.id === id);

  const rails: {
    lead: string;
    kindLabel: string;
    glyph: string;
    blockName: string;
    sub: string;
    /** Where the rail head links: a block page or, for the look tag, the tag feed. */
    href: string;
    list: Unit[];
  }[] = [];
  if (template && fromTemplate.length > 0) {
    rails.push({
      lead: "More from",
      kindLabel: KIND_META.template.label,
      glyph: KIND_META.template.glyph,
      blockName: template.name,
      sub: `Other units built on the ${template.name.toLowerCase()} structure — same skeleton, different look.`,
      href: `/library/b/template/${template.id}`,
      list: fromTemplate,
    });
  }
  if (lookTag && withLook.length > 0) {
    rails.push({
      lead: "More with",
      kindLabel: "Tag",
      glyph: "#",
      blockName: lookTag,
      sub: `Other units sharing the ${lookTag} look — same register, different shape.`,
      href: `/library?tag=${encodeURIComponent(lookTag)}`,
      list: withLook,
    });
  }

  if (rails.length === 0) return null;

  return (
    <>
      {rails.map((r) => (
        <section key={r.href} className="sec morefrom">
          <div className="container container-w-1760">
            <div className="sec-head" style={{ marginBottom: 8 }}>
              <h2 className="mf-title" style={{ fontSize: "clamp(20px,2.4vw,28px)" }}>
                {r.lead}{" "}
                <span className="mf-kind">
                  <span className="mf-glyph">{r.glyph}</span>
                  {r.kindLabel}
                </span>{" "}
                <span className="mf-sep">·</span> {r.blockName}
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
                {r.kindLabel === "Tag" ? "see all →" : "open block →"}
              </Link>
            </div>
            <p className="sec-blurb" style={{ marginTop: 0 }}>
              {r.sub}
            </p>
            <div className="relrail">
              {r.list.map((u) => (
                <UnitTile key={u.id} u={u} format={fmtById.get(u.format)} blockBy={blockBy} compact />
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
