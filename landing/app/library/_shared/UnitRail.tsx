"use client";

// Shared unit-listing RAIL wrapper (#089).
//
// The horizontal recommendation row used by the unit-detail "More from" /
// "More with" sections. Renders compact canonical <UnitCard>s in a scroll-snap
// strip (`.relrail`). Rail cards are compact (no ingredient ribbon, no Remix
// action), so there is no RemixModal state to own here.
//
// #090 DONE: the scroll mechanism lives ENTIRELY inside this component — the
// `.relrail` div was replaced with the shared <Carousel> WITHOUT touching the
// public props (units / formats / blocks) or any caller. The carousel goes
// inside; callers keep passing the same data. Each card is wrapped in a
// fixed-width `.crsl-item` (re-supplying the old `.relrail .utile` rail-item
// width) so compact cards keep their size.
//
// No visible borders: separation via bg-tint + shadow + spacing only.

import { useMemo } from "react";
import type { Block, BlockKind, Format, Unit } from "@/lib/library-v2/types";
import { Carousel } from "./Carousel";
import { UnitCard } from "./UnitCard";

export function UnitRail({
  units,
  formats,
  blocks,
}: {
  units: Unit[];
  formats: Format[];
  blocks: Block[];
}) {
  const formatById = useMemo(() => {
    const m = new Map<string, Format>();
    for (const f of formats) m.set(f.id, f);
    return m;
  }, [formats]);

  const blockBy = useMemo(() => {
    const m = new Map<string, Block>();
    for (const b of blocks) m.set(`${b.kind}:${b.id}`, b);
    return (kind: BlockKind, id: string) => m.get(`${kind}:${id}`);
  }, [blocks]);

  // The scroll mechanism — #090 swapped the bare `.relrail` strip for <Carousel>.
  // Each card is wrapped in `.crsl-item`, which re-supplies the fixed rail-item
  // width the old `.relrail .utile` rule provided (else compact cards collapse).
  return (
    <Carousel className="relrail-crsl" label="Related units">
      {units.map((u) => (
        <div key={u.id} className="crsl-item">
          <UnitCard u={u} format={formatById.get(u.format)} blockBy={blockBy} compact />
        </div>
      ))}
    </Carousel>
  );
}
