"use client";

// MoreFrom — the below-the-fold horizontal rails on the unit-detail page:
//   More from {Template} — other units built on the same skeleton
//   More in {Style}      — other units wearing the same look
// Compact UnitTiles in a scroll-snap rail, each rail headed by an "open block →"
// link to the (next task's) building-block page.

import Link from "next/link";
import type { Block, BlockKind, Format, Unit } from "@/lib/library-v2/types";
import { UnitTile } from "../../_shared/UnitTile";

export interface MoreFromProps {
  formats: Format[];
  blocks: Block[];
  template?: Block;
  style?: Block;
  fromTemplate: Unit[];
  inStyle: Unit[];
}

export function MoreFrom({ formats, blocks, template, style, fromTemplate, inStyle }: MoreFromProps) {
  const fmtById = new Map(formats.map((f) => [f.id, f]));
  const blockBy = (kind: BlockKind, id: string): Block | undefined =>
    blocks.find((b) => b.kind === kind && b.id === id);

  const rails: { title: string; sub: string; kind: BlockKind; block: Block; list: Unit[] }[] = [];
  if (template && fromTemplate.length > 0) {
    rails.push({
      title: `More from ${template.name}`,
      sub: `Other units built on the ${template.name.toLowerCase()} structure — same skeleton, different look.`,
      kind: "template",
      block: template,
      list: fromTemplate,
    });
  }
  if (style && inStyle.length > 0) {
    rails.push({
      title: `More in ${style.name}`,
      sub: `Other units wearing the ${style.name.toLowerCase()} look — same register, different shape.`,
      kind: "style",
      block: style,
      list: inStyle,
    });
  }

  if (rails.length === 0) return null;

  return (
    <>
      {rails.map((r) => (
        <section key={r.kind} className="sec morefrom">
          <div className="container container-w-1760">
            <div className="sec-head" style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: "clamp(20px,2.4vw,28px)" }}>{r.title}</h2>
              <Link
                href={`/library/b/${r.kind}/${r.block.id}`}
                className="seeall"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--vio)",
                }}
              >
                open block →
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
