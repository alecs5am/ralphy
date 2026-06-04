"use client";

// Shared unit-listing RAIL wrapper (#089).
//
// The horizontal recommendation row used by the unit-detail "More from" /
// "More with" sections. Renders compact canonical <UnitCard>s in a scroll-snap
// strip (`.relrail`). Rail cards are compact (no ingredient ribbon, no Remix
// action), so there is no RemixModal state to own here.
//
// #090 NOTE: the scroll mechanism lives ENTIRELY inside this component (the
// `.relrail` div below). #090 will replace that div with a shadcn <Carousel>
// WITHOUT touching the public props (units / formats / blocks) or any caller —
// the carousel goes inside, callers keep passing the same data. Do not leak the
// scroll mechanism out to callers.
//
// No visible borders: separation via bg-tint + shadow + spacing only.

import { useMemo } from "react";
import type { Block, BlockKind, Format, Unit } from "@/lib/library-v2/types";
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

  // The scroll mechanism — #090 swaps this `.relrail` strip for <Carousel>.
  return (
    <div className="relrail">
      {units.map((u) => (
        <UnitCard key={u.id} u={u} format={formatById.get(u.format)} blockBy={blockBy} compact />
      ))}
    </div>
  );
}
